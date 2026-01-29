//index.js

// require("dotenv").config({path: "./.env"});
import connectDB from "./db/connection.js";
import express from "express";

const app = express();

connectDB()
.then(()=> {
    app.on("error", (error)=> {
        console.error("Express app error: ", error.message);
        throw error;
    })
    app.listen(process.env.PORT || 4000, ()=> {
        console.log(`Server is running at PORT ${process.env.PORT}`);
    })
})
.catch((error)=> {
    console.error("MongoDB connection failed: ", error.message);
})