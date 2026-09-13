import express from "express";
const router=express.Router();
import registercontact from "../middlewares/Emergencycontact.js";
import verifytoken from "../middlewares/jwtverify.js";
export default router;

router.post("/",verifytoken,registercontact,(req,res)=>{
    const contact_name=req.contact;
    return res.status(201).json({
        message:"New SOS Contact registered Successfully",
        data:contact_name
    });
});