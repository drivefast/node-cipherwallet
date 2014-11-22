
module.exports = {

    // you will need to implement this when you use the registration page
    get_user_id_for_current_session: function(cb) {
        cb("", "radu@socal.rr.com");
    },
    
    // you will need to implement this when you your signup page includes registration
    //    capabilities for the QR login service
    authorize_session_for_user: function(user_id, cb) {
    // called by the login AJAX poll function if QR login was successful, in order to 
    //    return the user info needed by your web application
    // this function should perform the same operations as your regular login (typically
    //    set the session variables for the logged-in user), and is expected to return 
    //    a dictionary with whatever you need to forward to the browser, in response to
    //    the AJAX poll
        var sqlite3 = require('sqlite3').verbose();
        var db = new sqlite3.Database(__dirname + '/../your.db');
        db.get(
            "SELECT email, firstname FROM users WHERE email = ?;", user_id,
            function(err, u) {
                if (err)
                    cb(err, ""); 
                else
                    cb("", { 'firstname': u.firstname, 'email': u.email });
            }
        );
    },
    
}