//  temporary storage facility using memcached

var globals = require("./globals.js");
var constants = require("./constants.js");

var Memcached = require('memcached');
var mcd = new Memcached(constants.MCD_CONFIG);

module.exports = {

    is_nonce_valid: function (arg1, arg2, ttl, cb) {
        // adds a nonce with a limited time-to-live
        // failure means that a nonce with the same key already exists
        mcd.add(K_NONCE.format(arg1, arg2), 0, ttl, function(err) { cb(err); });
    },     

    cw_session_data: function(session_id, svar, val, cb) {
        // cipherwallet session variables managed in the temp store
        mcd.get(K_CW_SESSION.format(session_id), function(err, json_s) {
            if (err) 
               cb(err, null);
            else {
                var s = json_s ? JSON.parse(json_s) : {};
                if (val == null)
                    // return property if exists
                    cb("", s.hasOwnProperty(svar) ? s[svar] : null);
                else {
                    // session exist, set the session variable and re-save
                    s[svar] = val;
                    mcd.set(
                        globals.K_CW_SESSION.format(session_id), 
                        JSON.stringify(s), 
                        constants.CW_SESSION_TIMEOUT,
                        function(err) {
                            if (err)
                                cb(err, null);
                            else
                                cb("", val);
                        }
                    );
                }
            }
        })

    },    

    set_user_data: function(session_id, user_data, cb) {
    // this function temporarily stores data transmitted by user, when POSTed 
    //    by the user device; the data is then picked up by the page ajax
    //    polling mechanism
        mcd.set(
            globals.K_USER_DATA.format(session_id), JSON.stringify(user_data), 30, 
            function(err) { cb(err); }
        );
    },

    get_user_data: function(session_id, cb) {
    // the complement of the above: gets called by the web page polling mechanism to 
    //    retrieve data transmitted (POSTed) by the user's device, after scanning a QR code
        mcd.get(
            globals.K_USER_DATA.format(session_id), 
            function(err, data) { cb(err, data ? data : undefined); }
        );
    },

    set_signup_registration_for_session: function(session_id, reg_tag, complete_duration, cb) {
    // this function is called when the user's mobile app uploaded signup data, 
    //    in addition to the set_user_data() above
    // it returns a new login credentials record
    
        var creds = require("./db_interface.js").create_cipherwallet_user(reg_tag);
        mcd.set(
            globals.K_SIGNUP_REG.format(session_id), 
            JSON.stringify(creds), 
            complete_duration, 
            function(err) {
                delete creds['registration'];
                cb(err, creds);
            }
        );
    },

    get_signup_registration_for_session: function(session_id, cb) {
    // when the user completes the signup process (by submitting the data on the
    //    signup page), we need to call this function to retrieve the registration
    //    confirmation tag that we saved with the function above
        mcd.get(
            globals.K_SIGNUP_REG.format(session_id), 
            function(err, creds) { cb(err, creds ? JSON.parse(creds) : undefined); }
        );
    },

    set_user_ident: function(session_id, user_ident, cb) {
    // on QR login, the push web service invoked by the cipherwallet API calls this function 
    //    to temporarily store user identification data until it gets polled by the ajax 
    //    functions on the login page
        mcd.set(
            globals.K_USER_IDENT.format(session_id), JSON.stringify(user_ident), 30, 
            function(err) { cb(err); }
        );
    },

    get_user_ident: function(session_id, cb) {
    // on QR login push, this function gets called by the login page poll mechanism 
    //    to retrieve user identification data posted with the function above
        mcd.get(
            globals.K_USER_IDENT.format(session_id), 
            function(err, data) { cb(err, data ? JSON.parse(data) : undefined); }
        );
    },
    
}