var globals = require("./globals.js");
var constants = require("./constants.js");
var tmpstore = require("./tmpstore_" + constants.TMP_DATASTORE + ".js");

function authorize_request(rq, cb) {
    // select the X- headers from the request
    // note that express decides to lowercase all the header names,
    // we have to re-capitalize them grrrr
    x_headers = {};
    for (var k in rq.headers)
        if (k.substr(0, 2) == "x-") x_headers[k.capitalize_parts()] = rq.headers[k];

    cqr = require("./cqr_lib.js");
    cqr.verify(rq.method, "/cipherwallet" + rq.path, x_headers, rq.body, rq.headers['authorization'], 
        function(ret) { cb(ret); }
    );
};

module.exports = {

    define: function(router) {

        router.get("/cipherwallet.js", function(rq, rp) {
            rp.sendFile(__dirname + "/cipherwallet.js");
        });

        router.route("/login")
            .head(function(rq, rp) { 
                authorize_request(rq, function(ret) { 
                    rp.status(ret ? 200 : 403).end(); 
                }); 
            })
            .post(this.callback_with_data_login);
        router.route("/signup")
            .head(function(rq, rp) { rp.end(); })
            .post(this.callback_with_data);
        router.route("/checkout")
            .head(function(rq, rp) { rp.end(); })
            .post(this.callback_with_data);
        router.route("/reg")
            .head(function(rq, rp) { rp.end(); })
            .post(this.callback_with_data);

        router.get("/:tag/qr.png", this.qr);
        router.get("/:tag", this.poll);
        router.post("/:tag", this.set_qr_login_data);

    },

    qr: function(rq, rp) {
        // called by an AJAX request for cipherwallet QR code
        // this action is typically invoked by your web page containing the form, thru the code 
        //     in cipherwallet.js, to obtain the image with the QR code to display
        // it will return the image itself, with an 'image/png' content type, so you can use 
        //     the URL to this page as a 'src=...' attribute for the <img> tag

        // default timeout values, do not modify because they must stay in sync with the API
        var DEFAULT_TTL = {
            signup: 120,
            login: 60,
            checkout: 300,
            reg: 30,
        };

        // create an unique session identifier
    	var cw_session = globals.randomString(8);
        var qr_tag = rq.params.tag;
        if (!qr_tag.match(/^[a-zA-Z0-9.:_-]+$/)) {
            // failed validation of the qr tag
            rp.status(400).end(); return;
        }
        cw_session += "-" + qr_tag;

        // get the user data request template; templates for each type of request are pre-formatted 
        //    and stored in the constants file, in the $qr_requests variable
        if (constants.qr_requests.hasOwnProperty(qr_tag))
            var rq_def = constants.qr_requests[qr_tag];
        else {
            rp.status(501).end(); return;
        }

        // set the time-to-live of the cipherwallet session in the temporary storage
        var cw_session_ttl = rq_def.qr_ttl || DEFAULT_TTL[rq_def.operation];
        tmpstore.cw_session_data(
            cw_session, 'qr_expires', 1 + cw_session_ttl + parseInt(new Date().getTime() / 1000),
            function(err, data) {
                if (err) {
                    rp.status(500).end(); return;
                } else {
                    // for registration QR code requests, we also save the current user ID in the short term storage
                    if (rq_def.operation == globals.OP_REGISTRATION) {
                        var hooks = require("./hooks.js");
                        hooks.get_user_id_for_current_session(function(err, uid) {  // you MUST implement this in hooks.js
                            if (uid)
                                tmpstore.cw_session_data(cw_session, 'user_id', uid, function(err, data) {
                                    if (err) {
                                        rp.status(500).end(); return;
                                    }
                                });
                            else {
                                rp.status(401).end(); return;
                            }
                        });  
                    }
                    // time to get the QR code from the cipherwallet API
                    rp.set('Content-Type', "image/png");
                    var cqr = require("./cqr_lib.js");
                    var method = "POST";
                    var resource = "/" + qr_tag + "/" + cw_session + ".png";
                    var request_params = {};
                    if (rq_def.hasOwnProperty('qr_ttl')) request_params['ttl'] = rq_def.qr_ttl;
                    if (rq_def.hasOwnProperty('callback_url')) request_params['push_url'] = rq_def.callback_url;
                    if ([ globals.OP_LOGIN, globals.OP_REGISTRATION, ].indexOf(rq_def.operation) > -1) {
                        var display = rq_def.display;
                        if (typeof(display) == 'function')
                            request_params['display'] = display();
                        else if (typeof(display) == 'string') 
                            request_params['display'] = display;
                    }
                    // TODO should do the same thing for the service params...
                    var request_params_str = require('querystring').stringify(request_params);
                    var api_rq_headers = cqr.auth(
                        constants.CUSTOMER_ID, constants.API_SECRET, method, resource, request_params, constants.H_METHOD
                    );
                    api_rq_headers['Content-Type'] = "application/x-www-form-urlencoded";
                    api_rq_headers['Content-Length'] = request_params_str.length;
    
                    // get the QR image from the API and send it right back to the browser
                    var http = require("http");
                    var api_call_meta = {
                        hostname: constants.API_URL,
                        path: resource,
                        method: method,
                        headers: api_rq_headers
                    };
                    var api_call = http.request(api_call_meta, function(api_rp) {
                        api_rp.setEncoding("binary");
                        var img_bytes = []; 
                        api_rp.on('data', function(chunk) { img_bytes += chunk; });
                        api_rp.on('end', function() { 
                            rp.cookie("cwsession-" + qr_tag, cw_session, {
                                expires: new Date(Date.now() + 1000 * constants.CW_SESSION_TIMEOUT), path: "/"
                            });
                            rp.send(new Buffer(img_bytes, 'binary')); 
                        });
                    }).on('error', function(e) {
                        var fs = require('fs');
                        rp.send(fs.readFileSync(__dirname + "/1x1.png"));
                    });
                    api_call.write(request_params_str);
                    api_call.end();
                }
            }
        );
    },

    poll: function(rq, rp) {
        // AJAX polling for the status of a page awaiting QR code scanning
        // this action is typically invoked periodically by the browser, thru the code in cipherwallet.js, 
        //     in order to detect when / if the user scanned the QR code and transmitted the expected info

        // we look for the presence of requested info associated with the data in the storage place
        var cw_session_id = rq.cookies["cwsession-" + rq.params.tag];
        if (typeof cw_session_id === "undefined") {
            rp.status(410).end(); return;
        }

        tmpstore.cw_session_data(cw_session_id, 'qr_expires', null, function(err, val) {
            if (err || (val < (Date.now() / 1000))) {
                rp.status(410).end(); return;
            }
            // obtain data posted by the user...
            tmpstore.get_user_data(cw_session_id, function(err, user_data_json) {
                if (user_data_json) {
                    // QR scan data is present, submit it as AJAX response
                    rp.set('Content-Type', "application/json");
                    rp.send(user_data_json);
                }
            });
            // ... except for login data, which sits in a different location
            tmpstore.get_user_ident(cw_session_id, function(err, user_ident) {
                if (user_ident) {
                    // this is user data for the login service
                    // if the user signature was hashed properely, we can declare the user logged in
                    var cqr = require("./cqr_lib.js");
                    cqr.authorize(user_ident, function(user_id) {
                        if (user_id) {
                            // you MUST implement the function below in hooks.py
                            var hooks = require("./hooks.js");
                            hooks.authorize_session_for_user(user_id, function(err, user_data) {
                                if (user_data) {
                                    rp.set('Content-Type', "application/json");
                                    rp.send(user_data ? user_data : { 'error': "User not registered" });
                                }
                            });
                        } else {
                            rp.status(401).end(); return;
                        }
                    });
                }
            });
            setTimeout(
                function() { if (!rp.headersSent) rp.status(202).end(); }, 
                1000 * constants.POLL_DELAY
            );
        });
    },

    set_qr_login_data: function(rq, rp) {
    // when the user presses (in the browser) the submit button on a signup form, the web app would 
    //     create the regular user record in the database. if the submit form was auto-filled as a 
    //     result of a cipherwallet QR code scan, then we should have cipherwallet registration data 
    //     in the short term storage, and we need to confirm to the cipherwallet API that the user 
    //     has been, in the end, signed up for the service. therefore, after completing the normal 
    //     signup procedure, the web page also calls this URL to confirm the cipherwallet registration

        // we should have a cookie that gives out the session name
        var cw_session_id = rq.cookies["cwsession-" + rq.params.tag];
        if (typeof cw_session_id === "undefined") {
            rp.status(410).end(); return;
        }
        if (typeof rq.body.user_id === "undefined") {
            rp.status(400).end(); return;
        }

        // we should also have a session variable set, corresponding to this cookie
        // (a cipherwallet session lives in the customer's short term storage facility)
        tmpstore.get_signup_registration_for_session(cw_session_id, function(err, reg_data) {
            if (reg_data) {
                // call the cipherwallet API to confirm the registration
                var method = "PUT";
                var resource = "/reg/" + reg_data.registration;
                var cqr = require("./cqr_lib.js");
                var api_rq_headers = cqr.auth(
                    constants.CUSTOMER_ID, constants.API_SECRET, 
                    method, resource, "", constants.H_METHOD
                );
                var http = require("http");
                var api_call_meta = {
                    hostname: constants.API_URL,
                    path: resource,
                    method: method,
                    headers: api_rq_headers
                };
                var api_call = http.request(api_call_meta, function(api_rp) {
                    if (api_rp.statusCode == 200) {
                        // confirmed registration with the cipherwallet API, we just have to 
                        //     save the credentials in the permanent storage now
                        var db = require("./db_interface.js");
                        db.set_user_data_for_qr_login(rq.body.user_id, reg_data, function(err) {
                            if (err) {
                                rp.status(500).end(); return;
                            } else {
                                delete reg_data['registration'];
                                rp.set('Content-Type', "application/json");
                                rp.send(reg_data);
                            }
                        });
                    } else {
                        rp.status(410).end(); return;
                    }
                }).on('error', function(e) { rp.status(410).end(); return; });
                api_call.write("");
                api_call.end();

            } else {
                rp.status(410).end(); return;
            }
        });
    },

    callback_with_data_login: function(rq, rp) {
    // login callback requests come from the cipherwallet API server and they're signed with
    //    our own credentials (as opposed to the other requests, that come unsigned, directly  
    //    from the mobile app)    
        
        authorize_request(rq, function(ok) {
            if (!ok)
                rp.status(403).end();
            else {
                // store all the params in the request (except the session id) in the temporary storage
                // the next poll coming from the browser will pick them up, perform authorization, etc
                var session = rq.body['session'];
                delete rq.body['session'];
                tmpstore.set_user_ident(session, rq.body, function(err) {
                    if (err) rp.status(500);
                    rp.end();
                });
            }
        });
    },

    callback_with_data: function(rq, rp) {
    // accepts callbacks containing data from the mobile app and places it temporarily in the 
    //     short term storage; from there, it will be picked up on the next poll and dispatched 
    //     to the form displayed by the browser

        var operation = rq.route.path.substr(1);

        var session = rq.body['session'];
        if (typeof session == 'undefined') {
            rp.status(400).end(); return;
        }

        // signup and registration operations have a reg_meta entry
        var reg_meta = rq.body['reg_meta'];
        if (reg_meta) {
            delete rq.body['reg_meta'];
            var reg_tag = reg_meta['tag'];
        }

        var ret_dict = {};
        if (operation == globals.OP_REGISTRATION) {
            // get user ID for the browser session that initiated the registration
            tmpstore.cw_session_data(session, 'user_id', null, function(err, user_id) {
                if (err || (user_id === null)) {
                    rp.status(410).end(); return;
                }
                // confirm registration request by calling the cipherwallet API
                var cqr = require("./cqr_lib.js");
                var method = "PUT";
                var resource = "/reg/" + reg_tag;
                var api_rq_headers = cqr.auth(
                    constants.CUSTOMER_ID, constants.API_SECRET, 
                    method, resource, "", constants.H_METHOD
                );
                var http = require("http");
                var api_call_meta = {
                    hostname: constants.API_URL,
                    path: resource,
                    method: method,
                    headers: api_rq_headers
                };
                var api_call = http.request(api_call_meta, function(api_rp) {
                    // create and save a set of new cipherwallet credentials in permanent storage
                    var db = require("./db_interface.js");
                    cw_user_data = db.create_cipherwallet_user(reg_tag);
                    db.set_user_data_for_qr_login(user_id, cw_user_data, function(err) {
                        if (err) {
                            rp.status(500).end(); return;
                        } else {
                            delete cw_user_data['registration'];
                            rp.set('Content-Type', "application/json");
                            rp.send(cw_user_data).end();
                        }
                        // silence up the browser poll (rp only contains elements if cipherwallet credentials
                        //    are now safe in the house)
                        tmpstore.set_user_data(
                            session, { registration: err ? "failed" : "success" }, 
                            function(err) {}
                        );
                    });
                }).on('error', function(e) { 
                    tmpstore.set_user_data(session, { registration: "failed" }, function(err) {});
                    rp.status(410).end(); 
                    return; 
                });
                api_call.write("");
                api_call.end();
            });
        } else if (operation == globals.OP_SIGNUP) {
            tmpstore.set_signup_registration_for_session(
                session, reg_tag, parseInt(reg_meta['complete_timer']), 
                function(err, creds) {
                    if (err) {
                        rp.status(500).end(); return;
                    } else {
                        rp.set('Content-Type', "application/json");
                        ret_dict.credentials = creds;
                        rp.send(ret_dict);
                    }
                }
            );
        }

        if (operation != globals.OP_REGISTRATION) {
            // store the request payload (i.e. data from the mobile app) in the temporary storage, 
            //    so that the next poll will find it
            tmpstore.set_user_data(session, rq.body, function(err) {
                if (err) {
                    rp.status(500).end(); return;
                } else {
                    // we're in the 200 OK territory already, but if possible, build a decent response for 
                    //    the mobile app
                    var confirm = constants.qr_requests[session.split('-')[1]].confirm;
                    if (typeof(confirm) == 'function')
                        ret_dict.confirm = confirm();
                    else if (typeof(confirm) == 'string')
                        ret_dict.confirm = confirm;
                }
            });
        }

    },

}

