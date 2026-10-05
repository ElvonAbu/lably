import express from "express";
const router=express.Router();
import labinfo from "../middlewares/Labinformation.js";
import verifytoken from "../middlewares/jwtverify.js";
export default router;

router.post("/",verifytoken,labinfo,(req,res)=>{
    const newlabinfo=req.newlab;
    return res.status(201).json({
        message:"New lab Registration Successful"
    });

});