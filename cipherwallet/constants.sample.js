var globals = require("./globals.js");

module.exports = {

    // your customer ID and API secret key, as set on https://cipherwallet.com/dashboard.html
    CUSTOMER_ID: "YOUR_CIPHERWALLET_CUSTOMER_ID",
    API_SECRET: "YOUR_CIPHERWALLET_API_SECRET",

    // API location
    API_URL: "api.cqr.io",
    // preferred hashing method to use on message encryption: md5, sha1, sha256 or sha512
    H_METHOD: "sha256",
    // how long (in seconds) do we delay a "still waiting for user data" poll response
    POLL_DELAY: 2,
    // service id, always "cipherwallet"
    SERVICE_ID: "cipherwallet",

    // depending on your temporary datastore of choice, uncomment one of the following sections
    // and adjust the settings accordingly
    //   memcached:
//  TMP_DATASTORE: 'memcached', MCD_CONFIG: ['localhost:11211', 'localhost:11212'],
    //   redis:
//  TMP_DATASTORE: 'redis', REDIS_HOST: "localhost", REDIS_PORT: 6379,
    //   plaintext files:
//  TMP_DATASTORE: 'sessionfiles', TMPSTORE_DIR: "/path/to/session/directory/",
    // how long are we supposed to retain the information about a QR scanning session
    // the value should be slightly larger than the maximum QR time-to-live that you use
    CW_SESSION_TIMEOUT: 610,

    // for logins via QR code scanning, you need to provide access to the database where 
    // your users information is stored (assuming here you are using a SQL database)
    // we use the any-db database abstraction layer, see https://github.com/grncdr/node-any-db
    // we create a single connection, but you may be interested in creating a connections pool
    //     --------   uncomment and set one of the lines below   ---------
//  DB_ADAPTER: "mssql", DB_HOST: "mssql.yourdomain.com", DB_PORT: 1433, DATABASE: "my_users",
//  DB_ADAPTER: "mysql", DB_HOST: "mysql.yourdomain.com", DB_PORT: 3306, DATABASE: "my_users",
//  DB_ADAPTER: "postgres", DB_HOST: "database.yourdomain.com", DB_PORT: 5432, DATABASE: "my_users",
//  DB_ADAPTER: "sqlite3", DB_HOST: "", DB_PORT: 0, DATABASE: "/path/to/your.db", // do not set DB_HOST or DB_PORT
    DB_USERNAME: "god",
    DB_PASSWORD: "zzyzx",

    // your user's secret keys must be stored in an encrypted form in the cw_logins table
    // we use an AES-256 encryption algorithm for that, with the encryption key below
    // the encryption itself comes in play in db-interface.lib.php
    // the AES-256 encryption key must be 32-bytes long; example:
//  CW_SECRET_ENC_KEY: "000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F",
    // hint: to easily generate a 32-byte encryption key like needed here, just generate 2 random UUIDs, 
    //    concatenate them, and remove the formatting dashes

    // provide an entry in this map for the div id of every cipherwallet QR code you are using
    // for each of them you must provide the operation type, and the time-to-live of the QR code
    // for some of them you can customize a message that the user sees at the top of the request 
    //    page; like for example, you can customize he message for the payment details request 
    //    so that it mentions the amount to be charged to the credit card. same thing for a 
    //    customized message sent back to the user after they transferred the data from the 
    //    mobile app. you can either supply a string to those variables, or a function that 
    //    returns a string.
    qr_requests: {
        signup_form_qr: {
            operation: globals.OP_SIGNUP, 
            qr_ttl: 300, 
            display: "Simulate you are signing up for a new account at\\your.website.com",
            confirm: function() {
                return {
                    title: "cipherwallet signup",
                    message: "Yo-Yo-Your signup data has been submitted.",
                };
            },
        },
        registration_qr: {
            operation: globals.OP_REGISTRATION, 
            qr_ttl: 30,
            confirm: function() {
                return {
                    title: "cipherwallet registration",
                    message: "Thank you. You may now use cipherwallet to log in to this website.",
                };
            },
        },
        login_form_qr: {
            operation: globals.OP_LOGIN, 
            qr_ttl: 120,
        },
        checkout_form_qr: {
            operation: globals.OP_CHECKOUT, 
            qr_ttl: 600, 
//            display: get_cart_total_value(),   // you may implement this function in hooks.js
            confirm: function() {
                return "The payment information has been submitted. No worries, we won't charge you.";
            },
        },
    },

}

