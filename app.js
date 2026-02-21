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

const defaultOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:8080",
  "https://aoandco.tech",
  "https://www.aoandco.tech",
];

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
      : defaultOrigins;
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    if (!process.env.CORS_ORIGIN) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
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
