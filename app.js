const express = require("express");
const cors = require("cors")
// const morgan = require("morgan");
const bodyParser = require("body-parser");

const authRoutes = require("./routes/auth");
const agentRoutes = require("./routes/agent");
const clientRoutes = require("./routes/client");
// const feedbackRoute = require("./routes/verification");
const adminRoutes = require("./routes/admin");


const app = express();

app.use(cors())
// app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// app.use("/v1/verification", feedbackRoute);
app.use("/v1/auth", authRoutes);
app.use("/v1/agent", agentRoutes);
app.use("/v1/client", clientRoutes);
app.use("/v1/admin", adminRoutes);

app.get("/", (req,res)=>{
    res.status(200).json({
        success:true,
        message:"Welcome to AO & CO"
    })
})

// app.get("*", (req, res) => {
//     res.status(404).json({
//         statusCode: false,
//         message: "Page not found",
//     });
// });

app.use((err, req, res, next)=>{
    res.status(404).json({
        success:false,
        message:"Somehting went wrong"
    })
})


module.exports = app;
