var express = require("express");
var app = express();
var cookieParser = require('cookie-parser');
app.use(cookieParser());
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var cw_router_lib = require("./cipherwallet/api_router.js");
var cw_router = express.Router();
app.use('/cipherwallet', cw_router);
cw_router_lib.define(cw_router);

///////////////   regular (static and template) files processing

app.use("/css", express.static(__dirname + "/css"));
app.use("/img", express.static(__dirname + "/img"));
app.use("/js", express.static(__dirname + "/js"));

app.get("/your.db", function(rq, rp) {
	rp.status(401).send("Unauthorized");
});

app.get("/", function(rq, rp) {
	rp.redirect("/cw_index.html");
});
app.get("/cw_index.html", function(rq, rp) {
	rp.sendFile(__dirname + "/cw_index.html");
});

///////////////   ajax API

app.post("/login", function(rq, rp) {
// This web service is nothing else than a sample, classic, username-and-password
// login procedure. You probably already have something like this on your website, 
// and you are not required to modify it in any way for cipherwallet

	var email = rq.body.email.substr(0, 16);
	var password = rq.body.password.substr(0, 16);

    var sqlite3 = require('sqlite3').verbose();
	var db = new sqlite3.Database(__dirname + '/your.db');
	db.get(
		"SELECT firstname, email, password FROM users WHERE email = ?;", 
		email, 
		function(err, u) {
			if (err) {
				console.log(err);
                rp.status(404).end(); return;
			} else {
                if (require("bcrypt-nodejs").compareSync(password, u.password))
                    rp.send({ 'firstname': u.firstname, 'email': u.email });
                else {
                    rp.status(401).end(); return;
                }
			}
		}
	);

});

app.post("/user/:user_id", function(rq, rp) {
// This sample web service is created to look similar to what is called with a POST method 
//     by your signup web page, when the user presses the "create user" submit button. Form 
//     data is POSTed from the signup page.
// If data signup page data was loaded from the mobile app (QR code scanning), we also 
//     register the user to use cipherwallet (QR code scanning) for the logins
// This should mostly be *your* procedure to create an user record, and should work regardless
//     of whether cipherwallet is active or not

    var firstname = rq.body.firstname.substr(0, 16);
    var email = rq.body.email.substr(0, 64);
    var password = require("bcrypt-nodejs").hashSync(rq.body.password1.substr(0, 16));

    var sqlite3 = require('sqlite3').verbose();
	var db = new sqlite3.Database(__dirname + '/your.db');
    // if the user already exists, delete it (...obviously, you wouldn't do that on your 
    // real website, right?)
    db.run("DELETE FROM users WHERE email = ?;", rq.param('user_id'));
    // now add the user in your standard users table
	db.run(
        "INSERT INTO users(firstname, email, password, created_on) VALUES(?, ?, ?, ?);", 
		firstname, email, password, parseInt(Date.now() / 1000),
		function(err) {
			if (err) {
				console.log(err);
                rp.status(500).end(); return;
			} else {
			    // looks like we successfully created the user record
			    // ===========================  IMPORTANT  =================================
			    // ====== YOU MAY CALL THE set_qr_login_data() FUNCTION DIRECTLY HERE ======
			    // === just make sure to pass in a tag= parameter in your POST request,  ===
			    // === having the same value as the qrContainerID property; like in our  ===
			    // === example, this would be tag=signup_form_qr and  here we would call ===
			    // ===     rq.body.user_id = rq.body.email;                              ===
			    // ===     cw_router_lib.set_qr_login_data(rq, rp);                      ===
			    // =========================================================================
                // for now, we rely on a secondary AJAX request made by the client-side 
                //  javascript with the registerForQRLogin() member function; so we just
			    // return something nice for the browser
                rp.send({ 'firstname': firstname, 'email': email });
			}
		}
	);

});

// definitely find some better server than this...
var HTTP_PORT = 8080
app.listen(HTTP_PORT);
console.log("server started on :" + HTTP_PORT)

