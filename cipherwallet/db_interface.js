
var anyDB = require("any-db");
var crypto = require("crypto");
var globals = require("./globals.js");
var constants = require("./constants.js");

var AES_BLOCKSIZE = 16;

function hex2buf(hex_string) {
    var buf = new Buffer(hex_string.length / 2);
    for (var b = 0; b < hex_string.length; b += 2)
        buf[b / 2] = parseInt(hex_string.substr(b, 2), 16);
    return buf;    
}

// create a connection to the database
var db_engine = anyDB.createConnection({
    adapter: constants.DB_ADAPTER,
    host: constants.DB_HOST,
    port: constants.DB_PORT,
    database: constants.DATABASE,
    username: constants.DB_USERNAME,
    password: constants.DB_PASSWORD
});

function encrypt_secret(plaintext) {
    // use this function to encrypt user's secret key used in the signup / registration service
    // this is an example using AES-256 encryption
    var iv = crypto.randomBytes(AES_BLOCKSIZE);
    var aes = crypto.createCipheriv('aes-256-cfb', hex2buf(constants.CW_SECRET_ENC_KEY), iv);
    var encrypted_payload = aes.update(plaintext, 'ascii');
    encrypted_payload_fin = aes.final();
    // note that we prefix the payload with the iv, before base64-encoding
    return Buffer.concat([iv, encrypted_payload, encrypted_payload_fin]).toString('base64');
}

function decrypt_secret(encrypted_secret) {
    // use this function to decrypt user's secret key used in the login service
    // this is an example using AES-256 encryption
    var encrypted_bytes = new Buffer(encrypted_secret, 'base64');
    // extract the iv, the rest of the buffer is the actually encrypted data
    var iv = new Buffer(AES_BLOCKSIZE);
    encrypted_bytes.copy(iv, 0, 0, AES_BLOCKSIZE);
    var encrypted_payload = encrypted_bytes.slice(AES_BLOCKSIZE);
    // build the AES decryptor
    var aes = crypto.createDecipheriv('aes-256-cfb', hex2buf(constants.CW_SECRET_ENC_KEY), iv);
    var plainbytes = aes.update(encrypted_payload);
    var plainbytes_fin = aes.final();
    return plainbytes.toString('ascii');
}

module.exports = {
    verify_timestamp: function(ts) {
        // used by the authorization verification function; checks to make sure the date 
        //     indicated by the client is not too much drifted from the current date
        var now = parseInt(Date.now() / 1000);
        return (ts >= (now - 3600)) && (ts <= (now + 3600));
    },

    verify_nonce: function(user, nonce, cb) {
        // used by the authorization verification function
        // this function checks to make sure the nonce used by the client has not been used 
        //     in the last few minutes / hours
        // typically we defer this function to the temporary key-value store layer
        var tmpstore = require("./tmpstore_" + constants.TMP_DATASTORE + ".js");
        tmpstore.is_nonce_valid(user, nonce, 3600, function(is_valid) { cb(is_valid); });
    },

    accepted_hash_method: function(h) {
        // validate the signature hashing algorithm
        if (h == "")
            return "sha1";
        return (["md5", "sha1", "sha256", "sha512"].indexOf(h) >= 0) ? h : "";
    },

    create_cipherwallet_user: function(reg_tag) {
        return {
            hash_method: constants.H_METHOD,
            cw_user: globals.randomString(8),
            secret: globals.randomString(64),
            registration: reg_tag
        };
    },

    set_user_data_for_qr_login: function(user_id, extra_data, cb) {
    // add cipherwallet-specific login credentials to the user record
    // return a boolean value indicating the success of the operation

        // the user ID is submitted by your app, so we assume it's safe already
        db_engine.query("DELETE FROM cw_logins WHERE user_id = ?;", [user_id])
        .on('error', function(err) { cb(err, null); })
        .on('close', function () { 
            db_engine.query(
                "INSERT INTO cw_logins(user_id, cw_id, secret, reg_tag, hash_method, created) " +
                "VALUES (?, ?, ?, ?, ?, ?);", 
                [ 
                    user_id, extra_data['cw_user'], encrypt_secret(extra_data['secret']), 
                    extra_data['registration'], constants.H_METHOD, Date.now() / 1000
                ]
            )
            .on('error', function(err) { cb(err, null); })
            .on('close', function () { cb("", {
                user_id: user_id,
                cw_id: extra_data['cw_user'],
                secret: extra_data['secret'],
                reg_tag: extra_data['registration'],
                now: parseInt(Date.now() / 1000),
            }); })
        })
    },

    get_key_and_id_for_qr_login: function(cw_user, cb) {
    // get an user's secret key from the database, in order to authenticate them
    // the secret key has been associated with the user by user_data_for_qr_login() 
        db_engine.query(
            "SELECT user_id, secret, hash_method FROM cw_logins WHERE cw_id = ?;", 
            [cw_user]
        )
        .on('error', function(err) { cb(err, null); })
        .on('data', function(row) { 
            cb("", { 
                user_id: row.user_id, 
                secret: decrypt_secret(row.secret), 
                hash_method: row.hash_method
            });
        });
    },


    get_user_for_qr_login: function(user_id, cb) {
    // get an user's cipherwallet id, based on the database normal user ID
        db_engine.query("SELECT cw_id FROM cw_logins WHERE user_id = ?;", [user_id])
        .on('error', function(err) { cb(err, null); })
        .on('data', function(row) { 
            cb("", row);
        });
    },
    

    remove_user_for_qr_login: function(user_id, cb) {
    // disables the qr login for an user, by removing the associated record from
    // the cw_logins table
    // invoke with the real user ID as a parameter
        db_engine.query("DELETE FROM cw_logins WHERE user_id = ?;", [user_id])
        .on('error', function(err) { cb(err, null); })
        .on('end', function () { cb("", null); })
    },

}