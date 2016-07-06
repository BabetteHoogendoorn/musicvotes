/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

//Models
var Sequelize = require('sequelize');
var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var path = require('path');
var bodyParser = require('body-parser');
var fs = require('fs');
var pg = require('pg');
var session = require('express-session');
var app = express();

//client info
var client_id = '42b8675a7083451fa42112a5fb9a7d27'; // Your client id
var client_secret = '571ef69d3a714decb88d8bdbd0407947'; // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

//connect to server
var sequelize = new Sequelize ('musicvote', 'babettehoogendoorn', null, {
  host: 'localhost',
  dialect: 'postgres',
  define: {
    timestamps: false
  }
});

//set table in databse for stored information
var User = sequelize.define('user', {
  user_id: Sequelize.STRING,
  user_email: Sequelize.STRING,
  access_token: Sequelize.STRING,
  refresh_token: Sequelize.STRING
});

var Song = sequelize.define('song', {
  title: Sequelize.STRING,
  artist: Sequelize.STRING
});

var Vote = sequelize.define('vote');

var Event = sequelize.define('event', {
  event_name: Sequelize.STRING,
  event_end: Sequelize.STRING
});

//relation between tables
Vote.hasMany(User);
User.belongsTo(Vote);

Vote.belongsTo(Song);
Song.hasMany(Vote);

Vote.belongsTo(Event);
Event.hasMany(Vote);

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
 var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

//activate bodyParser
app.use(express.static(__dirname + '/public'))
.use(cookieParser());

//get login
app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

//get callback
app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };


    

    // .spread(function(user, created) {
    //   console.log(user.get({
    //     plain: true
    //   }))
    //   console.log(created)
    // })

    
    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
        refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log('API Get Body')
          console.log(body);
          //save userdata in database
          User.findOrCreate({
            where: {
              user_id: body.id
            }
          }).then(function(theuser) {
            User.findOne({
              where: {
                user_id: body.id
              }
            }).then(function(theuser){
              theuser.update({
                user_email: body.email,
                access_token: access_token,
                refresh_token: refresh_token
              })
              console.log('User created and updated:')
              console.log(theuser)
            })
            
          });
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

//get refresh token
app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

  //tell the port to listen
  var server = app.listen(8888, function () {
    console.log('Example app listening on port: ' + server.address().port);
  });


  //synching with database
  sequelize.sync({force: true}).then( function(){
    console.log('sync done');
  });