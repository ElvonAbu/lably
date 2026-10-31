import express from "express";
const router=express.Router();
import {signup,user_exist,signinwithgoogle} from "../middlewares/signup.js";
import Users from "../models/signup.js";
import {getallusers,loginwithgoogle} from "../middlewares/login.js";


router.post("/",signup,(req,res)=>{
    
});


router.get("/signupwithgoogle",loginwithgoogle,(req,res)=>{
    const data=req.newdata;
    res.status(200).json({message:"Signed in ",data:data.url});
});

router.get("/getusers",getallusers,(req,res)=>{
    const allusers=req.allusers;
    return res.status(200).json({message:"Got all users",data:allusers});
});




export default router;