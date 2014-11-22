module.exports = {
    OP_SIGNUP: "signup",
    OP_REGISTRATION: "reg",
    OP_LOGIN: "login",
    OP_2FA: "2fa",
    OP_CHECKOUT: "checkout",

    K_NONCE: "CQR_NONCE_{0}_{1}",       // + user, nonce
    K_CW_SESSION: "CW_SESSION_{0}",     // + cipherwallet session id
    K_USER_DATA: "CW_USER_DATA_{0}",    // + cw session id
    K_SIGNUP_REG: "CW_SIGNUP_REG_{0}",  // + cw session id
    K_USER_IDENT: "CW_USERIDENT_{0}",   // + cw session id

    randomString: function(chars) {
    // generate a random string with symbols from the below alphabet
        var ALPHABET = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_@";
        ret = "";
        bytes = require('crypto').randomBytes(chars);
        for (c = 0; c < chars; c++)
            ret = ret + ALPHABET.charAt(bytes[c] & 0x3F);
        return ret;
    },
    
}

if (!String.prototype.format) {
    String.prototype.format = function() {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function(match, number) { 
            return typeof args[number] != 'undefined' ? args[number] : match;
        });
    };
}

if (!String.prototype.capitalize_parts) {
    String.prototype.capitalize_parts = function() {
        return this.replace(/(^|[\s_-])([a-z])/g, function(m, p1, p2) { 
            return p1 + p2.toUpperCase(); 
        });
    };
}

