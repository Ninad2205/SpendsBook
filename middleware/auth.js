// middleware/auth.js

function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next(); // User is authenticated
    } else {
        req.flash('error', 'You need to log in to access this page.');
        return res.redirect('/login'); // Redirect to login page
    }
}

module.exports = isAuthenticated;
