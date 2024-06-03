const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const GOOGLE_CLIENT_ID = '566786276014-drcgkj209ag0q5f9dqqtdggvv2s8cvsc.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: 'https://e67c-2001-818-da5d-800-9492-68f2-9830-53e0.ngrok-free.app/auth/google/callback',
    },
    (request, accessToken, refreshToken, profile, done) => {
      return done(null, profile);
    }
  )
);

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

module.exports = passport;