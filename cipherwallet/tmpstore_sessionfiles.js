var fsys = require('fs');
var globals = require("./globals.js");
var constants = require("./constants.js");
var TMPSTORE_DIR = constants.TMPSTORE_DIR;

function file_write_with_expiration(fname, content, ttl, cb) {
    // write data to a file (overwrite if file already exists)
    fsys.writeFile(TMPSTORE_DIR + fname, content, function(err) {
        if (err) 
            cb(err); 
        else
            // file's mtime indicate its validity date
            var now = Date.now() / 1000;
            fsys.utimes(TMPSTORE_DIR + fname, now, ttl + now, function(err) {
                cb(err);
            })
    });
};

function file_read_if_not_expired(fname, cb) {
    // make sure the data is still valid (not expired)
    fsys.stat(TMPSTORE_DIR + fname, function(err, stats) {
        if (err)
            cb(((err.errno == 34) ? "" : err), ""); // 34 is ENOENT or ENOFILE
        else {
            var now = Date.now() / 1000;
            if (stats.mtime < now)
                cb("", "");
            else
                // seems ok so far, return the file content
                fsys.readFile(TMPSTORE_DIR + fname, function(err, data) {
                    if (err)
                        cb(err, "");
                    else
                        cb("", data);
                });
        }
    });
};

//  temporary storage facility using plaintext files 
//
// Obviously, this is NOT the ideal alternative of implementing a temporary storage.
//
// Some files become obsolete after a few seconds or minutes. To indicate the validity  
// of the files, as soon as we create them, we change the last-modified date to a 
// future date when the data is considered stale or invalid. You HAVE TO run a cron job 
// that deletes the obsoleted files, otherwise your directory will keep filling up

// find . -type f -mmin -$((60*24)) -exec rm '{}' \;

module.exports = {

    is_nonce_valid: function (arg1, arg2, ttl, cb) {
        // create a file representing a nonce 
        // if the file already exists, it means that the nonce attempts to being reused
        fsys.exists(TMPSTORE_DIR + globals.K_NONCE.format(arg1, arg2), function(exists) {
            if (exists)
                cb(false);
            else
                // we assume that the ttl is just approximatively OK, although the file 
                // may linger around for another few minutes after its expiration
                file_write_with_expiration(globals.K_NONCE.format(arg1, arg2), ".", ttl, function(err) {
                    // we wont handle the file write error, it's not that critical
                    cb(true);
                });
        });
    },     

    cw_session_data: function(session_id, svar, val, cb) {
        // cipherwallet session variables managed in the temp store
        file_read_if_not_expired(globals.K_CW_SESSION.format(session_id), function(err, json_s) {
            if (err) 
                cb(err, null);
            else {
                try {
                    var s = json_s ? JSON.parse(json_s) : {};
                    if (val == null)
                        // return property if exists
                        cb("", s.hasOwnProperty(svar) ? s[svar] : null);
                    else {
                        // session exist, set the session variable and re-save
                        s[svar] = val;
                        file_write_with_expiration(
                            globals.K_CW_SESSION.format(session_id), JSON.stringify(s), constants.CW_SESSION_TIMEOUT,
                            function(err) {
                                if (err)
                                    cb(err, null);
                                else
                                    cb("", val);
                            }
                        )
                    }
                } catch (err) {
                    cb(err, null);
                    return;
                }
            }
        
        });
    },    

    set_user_data: function(session_id, user_data, cb) {
    // this function temporarily stores data transmitted by user, when POSTed 
    //    by the user device; the data is then picked up by the page ajax
    //    polling mechanism
        file_write_with_expiration(
            globals.K_USER_DATA.format(session_id), JSON.stringify(user_data), 30, 
            function(err) { cb(err); }
        );
    },

    get_user_data: function(session_id, cb) {
    // the complement of the above: gets called by the web page polling mechanism to 
    //    retrieve data transmitted (POSTed) by the user's device, after scanning a QR code
        file_read_if_not_expired(
            globals.K_USER_DATA.format(session_id), 
            function(err, data) { cb(err, data ? data : undefined); }
        );
    },

    set_signup_registration_for_session: function(session_id, reg_tag, complete_duration, cb) {
    // this function is called when the user's mobile app uploaded signup data, 
    //    in addition to the set_user_data() above
    // it returns a new login credentials record
    
        creds = require("./db_interface.js").create_cipherwallet_user(reg_tag);
        file_write_with_expiration(
            globals.K_SIGNUP_REG.format(session_id), JSON.stringify(creds), complete_duration, 
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
        file_read_if_not_expired(globals.K_SIGNUP_REG.format(session_id), function(err, creds) {
            cb(err, creds ? JSON.parse(creds) : undefined);
        });
    },

    set_user_ident: function(session_id, user_ident, cb) {
    // on QR login, the push web service invoked by the cipherwallet API calls this function 
    //    to temporarily store user identification data until it gets polled by the ajax 
    //    functions on the login page
        file_write_with_expiration(
            globals.K_USER_IDENT.format(session_id), JSON.stringify(user_ident), 30, 
            function(err) { cb(err); }
        );
    },

    get_user_ident: function(session_id, cb) {
    // on QR login push, this function gets called by the login page poll mechanism 
    //    to retrieve user identification data posted with the function above
        file_read_if_not_expired(globals.K_USER_IDENT.format(session_id), function(err, data) { 
            cb(err, data ? JSON.parse(data) : undefined); 
        });
    },
    
}