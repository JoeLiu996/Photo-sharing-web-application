/* jshint node: true */

/*
 * This builds on the webServer of previous projects in that it exports the current
 * directory via webserver listing on a hard code (see portno below) port. It also
 * establishes a connection to the MongoDB named 'cs142project6'.
 *
 * To start the webserver run the command:
 *    node webServer.js
 *
 * Note that anyone able to connect to localhost:portNo will be able to fetch any file accessible
 * to the current user in the current directory or any of its children.
 *
 * This webServer exports the following URLs:
 * /              -  Returns a text status message.  Good for testing web server running.
 * /test          - (Same as /test/info)
 * /test/info     -  Returns the SchemaInfo object from the database (JSON format).  Good
 *                   for testing database connectivity.
 * /test/counts   -  Returns the population counts of the cs142 collections in the database.
 *                   Format is a JSON object with properties being the collection name and
 *                   the values being the counts.
 *
 * The following URLs need to be changed to fetch there reply values from the database.
 * /user/list     -  Returns an array containing all the User objects from the database.
 *                   (JSON format)
 * /user/:id      -  Returns the User object with the _id of id. (JSON format).
 * /photosOfUser/:id' - Returns an array with all the photos of the User (id). Each photo
 *                      should have all the Comments on the Photo (JSON format)
 *
 */

var mongoose = require('mongoose');
mongoose.Promise = require('bluebird');

var async = require('async');

var express = require('express');
var app = express();

// Load the Mongoose schema for User, Photo, and SchemaInfo
var User = require('./schema/user.js');
var Photo = require('./schema/photo.js');
var SchemaInfo = require('./schema/schemaInfo.js');

mongoose.connect('mongodb://localhost/cs142project6', { useNewUrlParser: true, useUnifiedTopology: true });

// We have the express static module (http://expressjs.com/en/starter/static-files.html) do all
// the work for us.
app.use(express.static(__dirname));


app.get('/', function (request, response) {
    response.send('Simple web server of files from ' + __dirname);
});

/*
 * Use express to handle argument passing in the URL.  This .get will cause express
 * To accept URLs with /test/<something> and return the something in request.params.p1
 * If implement the get as follows:
 * /test or /test/info - Return the SchemaInfo object of the database in JSON format. This
 *                       is good for testing connectivity with  MongoDB.
 * /test/counts - Return an object with the counts of the different collections in JSON format
 */
app.get('/test/:p1', function (request, response) {
    // Express parses the ":p1" from the URL and returns it in the request.params objects.
    console.log('/test called with param1 = ', request.params.p1);

    var param = request.params.p1 || 'info';

    if (param === 'info') {
        // Fetch the SchemaInfo. There should only one of them. The query of {} will match it.
        SchemaInfo.find({}, function (err, info) {
            if (err) {
                // Query returned an error.  We pass it back to the browser with an Internal Service
                // Error (500) error code.
                console.error('Doing /user/info error:', err);
                response.status(500).send(JSON.stringify(err));
                return;
            }
            if (info.length === 0) {
                // Query didn't return an error but didn't find the SchemaInfo object - This
                // is also an internal error return.
                response.status(500).send('Missing SchemaInfo');
                return;
            }

            // We got the object - return it in JSON format.
            console.log('SchemaInfo', info[0]);
            response.end(JSON.stringify(info[0]));
        });
    } else if (param === 'counts') {
        // In order to return the counts of all the collections we need to do an async
        // call to each collections. That is tricky to do so we use the async package
        // do the work.  We put the collections into array and use async.each to
        // do each .count() query.
        var collections = [
            {name: 'user', collection: User},
            {name: 'photo', collection: Photo},
            {name: 'schemaInfo', collection: SchemaInfo}
        ];
        async.each(collections, function (col, done_callback) {
            col.collection.countDocuments({}, function (err, count) {
                col.count = count;
                done_callback(err);
            });
        }, function (err) {
            if (err) {
                response.status(500).send(JSON.stringify(err));
            } else {
                var obj = {};
                for (var i = 0; i < collections.length; i++) {
                    obj[collections[i].name] = collections[i].count;
                }
                response.end(JSON.stringify(obj));

            }
        });
    } else {
        // If we know understand the parameter we return a (Bad Parameter) (400) status.
        response.status(400).send('Bad param ' + param);
    }
});

/*
 * URL /user/list - Return all the User object.
 */
app.get('/user/list', function (request, response) {
    let query = User.find({});
    query.select("first_name last_name").exec((err, users) => {
        if(err) {
            console.log("error", err);
            response.status(500).send(JSON.stringify(err));
        } else {
            console.log("success accessing /user/list");
            response.status(200).send(users);
        }
    });
});

/*
 * URL /user/:id - Return the information for User (id)
 */
app.get('/user/:id', function (request, response) {
    let id = request.params.id;
    User.findOne({ '_id' : id }, '-__v', (err, user) => {
        if(err) {
            console.log("error", err);
            response.status(400).send(JSON.stringify(err));
        } else if(!user || user.length <= 0) {
            console.log("user id" + id + "not found");
            response.status(400).send('user id' + id + 'not found');
        } else {
            console.log("success accessing /user/" + id);
            response.status(200).send(user);
        }
    });
});

/*
 * URL /photosOfUser/:id - Return the Photos for User (id)
 */
app.get('/photosOfUser/:id', function (request, response) {
    let id = request.params.id;
    Photo.find({ 'user_id': id }, "-__v", (err, photos) => {
        // make a copy of photos so adding user to photo.comment won't vialate mongoose schema
        if (err) {
            console.log("error", err);
            response.status(400).send(JSON.stringify(err));
        } else if (photos.length <= 0) {
            console.log('This user has no photo');
            response.status(200).send([]);
        } else {
            console.log("Success accessing /photosOfUser/" + id);
            photos = JSON.parse(JSON.stringify(photos));
            async.each(photos, function (photo, callback) {
                async.each(photo.comments, function (comment, callback) {
                    console.log("Success accessing photo comments");
                    User.findOne({ '_id': comment.user_id }, 'first_name last_name', (err, user) => {
                        if (err) {
                            console.log("error", err);
                            response.status(400).send(JSON.stringify(err));
                            callback(err);
                        } else if (!user || user.length <= 0) {
                            response.status(400).send('user id' + comment.user_id + 'not found');
                            callback('user id' + comment.user_id + 'not found');
                        } else {
                            comment.user = user;
                            delete comment.user_id;
                            callback();
                        }
                    });
                }, function (err) { // callback for comments
                    if (err) {
                        console.log("error", err);
                        response.status(500).send(JSON.stringify(err));
                    } else {
                        callback();
                    }
                })
            }, function (err) { // main callback
                if (err) {
                    console.log("error", err);
                    response.status(500).send(JSON.stringify(err));
                } else {
                    response.status(200).send(photos);
                }
            });
        }
    })
});


var server = app.listen(3000, function () {
    var port = server.address().port;
    console.log('Listening at http://localhost:' + port + ' exporting the directory ' + __dirname);
});


