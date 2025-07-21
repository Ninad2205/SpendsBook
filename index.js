const express = require('express');
const app = express();
const port = 4000;
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const mysql = require('mysql2');
const methodOverride = require("method-override");
const cors = require('cors');  // Import the CORS module
const bodyParser = require('body-parser');
const MySQLStore = require("express-mysql-session")(session);
const bcrypt = require('bcrypt');

require('dotenv').config();
app.set('views', path.join(__dirname, 'views'));

app.use(methodOverride('_method'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// Database connection
// const connection = mysql.createConnection({
//     host: 'localhost',
//     user: 'root',
//     database: 'dailyWage',
//     password: process.env.DB_PASSWORD,
// });
// MySQL Connection
const connection  = mysql.createConnection({

  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
connection.connect(err => {
    if (err) {
        console.error("Database connection failed:", err.stack);
        return;
    }
    console.log("Connected to database.");
});


//session store
const sessionStore = new MySQLStore({}, connection);


// Setup session options
const sessionOptions = {
    secret: process.env.SESSION_SECRET || "mysupersecretcode",
    store:sessionStore,
    resave: true,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure:false,
    }
};

app.use(cors()); 

// Middleware setup
app.use(session(sessionOptions));
app.use(flash());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));


app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    next();
});

// View engine and paths
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/views"));


// Routes
app.get("/", (req, res) => {
    if (req.session.userId) {
        return res.redirect(`/home`);
    }
    const q = "SELECT COUNT(*) AS count FROM money";
    connection.query(q, (err, result) => {
        if (err) {
            console.log(err);
            req.flash("error", "Error fetching data from database.");
            return res.redirect("/error");
        }
        const count = result[0].count;
        res.render("signup.ejs", { count });
    });
});

app.get("/testing",(req,res)=>{
  res.send("Working...");
});

//user register
app.get("/signup",(req,res)=>{
    if (req.session.userId) {
        return res.redirect(`/home`);
    }
    res.render("signup.ejs");
});

const util = require("util");

const query = util.promisify(connection.query).bind(connection);

app.post("/signup", async (req, res) => {
    const { userId, username, password } = req.body;

    // Basic validation
    if (!userId || !username || !password) {
        req.flash("error", "Invalid input. userId must be 10 characters long and all fields are required.");
        return res.redirect("/signup");
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `INSERT INTO users (userId, username, password) VALUES (?, ?, ?)`;
        await query(sql, [userId, username, hashedPassword]);

        req.flash("success", "New user registered successfully.");
        res.redirect("/login");
    } catch (err) {
        console.error("Signup Error:", err);

        if (err.code === "ER_DUP_ENTRY") {
            req.flash("error", "User ID or username already exists.");
            return res.redirect("/signup");
        }

        req.flash("error", "An unexpected error occurred. Please try again.");
        res.redirect("/signup");
    }
});

app.get("/login", (req, res) => {
    if (req.session.userId) {
        return res.redirect(`/home`);
    }
    res.render("login"); // Or your login.ejs page
});
//login route
app.post('/login', async (req, res) => {
    const { userId, password } = req.body;
    const q = 'SELECT * FROM users WHERE userId = ?';

    connection.query(q, [userId], async (err, results) => {
        if (err) {
            console.error(err);
            req.flash('error', 'Database error.');
            return res.redirect('/login');
        }

        if (results.length > 0) {
            const storedHashedPassword = results[0].password;

            const match = await bcrypt.compare(password, storedHashedPassword);
            if (match) {
                req.session.userId = userId; // Store userId in session
                req.flash('success', 'Login successful.');
                res.redirect('/home');
            } else {
                req.flash('error', 'Invalid User ID or Password.');
                res.redirect('/login');
            }
        } else {
            req.flash('error', 'Invalid User ID or Password.');
            res.redirect('/login');
        }
    });
});


// Home Page Route
app.get('/home', (req, res) => {
    if (!req.session.userId) {
        
        req.flash('error', 'Please log in first.');
        return res.redirect('/login');
    }
    const userId=req.session.userId;

    res.render('home',{userId}); 
});

// Show All Spends Route 
app.get('/showAll', (req, res) => {
    if (!req.session.userId) {
        req.flash('error', 'Please log in first.');
        return res.redirect('/login');
    }

    const q = 'SELECT * FROM items WHERE userId = ?';
    connection.query(q, [req.session.userId], (err, results) => {
        if (err) {
            console.error(err);
            req.flash('error', 'Error fetching data.');
            return res.redirect('/error');
        }

        req.flash("success", "Wage data retrieved successfully.");
        res.render('dashboard', { items: results });
    });
});


//user login after spends
app.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        req.flash("error", "Error fetching data from database.");
        return res.redirect('/login');
    }

    const userId = req.session.userId;

    const q = 'SELECT * FROM items WHERE userId = ?';
    connection.query(q, [userId], (err, results) => {
        if (err) {
            console.error(err);
            req.flash('error', 'Error fetching data.');
            return res.redirect('/error');
        }

        res.render('dashboard.ejs', { items: results ,userId});
    });
});


//calculate spends route
app.get("/calculateSpends",(req,res)=>{
    if (!req.session.userId) {
        req.flash("error", "You need to log in first.");
        return res.redirect('/login');
    }
    const userId = req.session.userId;
    res.render("sumSpends.ejs",{userId});
});
app.post('/calculateSpends', (req, res) => {
    if (!req.session.userId) {
        req.flash("error", "You need to log in first.");
        return res.redirect('/login');
    }
    const { userId, year, month } = req.body;
    const monthYear = `${year}-${month}`;

    const query = `
        SELECT SUM(price) AS total_spends
        FROM items
        WHERE userId = ? 
          AND DATE_FORMAT(date, '%Y-%m') = ?;
    `;

    connection.query(query, [userId, monthYear], (error, results) => {
        if (error) {
            console.error('Error executing query:', error);
            return res.status(500).send('Internal Server Error');
        }
        const totalSpends = results[0].total_spends || 0;

        const userId = req.session.userId;

        res.render('sumSpends', { year, month, totalSpends,userId });
    });
});

// Render login page
app.get('/login', (req, res) => {
    res.render('login.ejs'); 
});

//New spend route
app.get('/addSpend', (req, res) => {

    if (!req.session.userId) {
        req.flash("error", "Error fetching data from database.");
        return res.redirect('/login');
    }

    const userId = req.session.userId;
    res.render('addSpend', { userId });
});

// POST route to handle add spend form submission
app.post('/addSpend', (req, res) => {
    const { userId, nameOfItem, price, paymentMode, date } = req.body;
    const query = 'INSERT INTO items (userId, nameOfItem, price, paymentMode, date) VALUES (?, ?, ?, ?, ?)';
    connection.query(query, [userId, nameOfItem, price, paymentMode, date], (err, result) => {
        if (err) {
            console.error(err);
            return res.redirect('/addSpend?error=true');
        }
        res.redirect('/showAll');
    });
});

//delete route
app.delete("/item/:id", (req, res) => {
    const { id } = req.params;
    const q = "DELETE FROM items WHERE id = ?";
    
    connection.query(q, [id], (err) => {
        if (err) {
            console.log(err);
            req.flash("error", "Error deleting item from database.");
            return res.redirect("/error");
        }
        req.flash("success", "Item deleted successfully.");
        res.redirect("/showAll");
    });
});

//edit route
app.get("/item/:id/edit", (req, res) => {

    if (!req.session.userId) {
        req.flash("error", "Error fetching data from database.");
        return res.redirect('/login');
    }


    const { id } = req.params;
    const query = "SELECT * FROM items WHERE id = ?";

    connection.query(query, [id], (err, result) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).send("Internal server error");
        }

        if (result.length === 0) {
            return res.status(404).render("error", { message: "Item not found" });
        }

        const item = result[0];
        res.render("edit.ejs", { item });
    });
});

app.patch("/item/:id", (req, res) => {
    const { id } = req.params;
    const { nameOfItem, price, paymentMode, date } = req.body;

    if (!nameOfItem) {
        return res.status(400).send("Item name is required");
    }

    const query = `
        UPDATE items
        SET nameOfItem = ?, price = ?, paymentMode = ?, date = ?
        WHERE id = ?
    `;
    
    connection.query(query, [nameOfItem, price, paymentMode, date, id], (err) => {
        if (err) {
            console.error("Database query error:", err);
            req.flash("error", "Error updating item in the database.");
            return res.redirect("/error"); // Redirect to a custom error page or the previous page
        }
        req.flash("success", "Item updated successfully.");
        res.redirect("/showAll");
    });
});
app.get("/logout", (req, res, next) => {
    req.session.destroy(err => {
        if (err) {
            return next(err);
        }
        res.clearCookie('connect.sid');
        res.redirect("/login");
    });
});

//error route to render error page
app.get("/error", (req, res) => {
    res.render("error.ejs");
});

app.get("*", (req, res) => {
    res.status(404).send("<h1>404 Not Found</h1>");
});

// Server listening
app.listen(port, () => {
    console.log(`App listening on port ${port}!`);
});
