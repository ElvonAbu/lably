import express from "express";
const router=express.Router();
import {login,loginwithgoogle} from "../middlewares/login.js";
export default router;

router.post("/",login, (req, res) => {
  const user = req.userdata;
  res.status(200).json({
    message: "Login Successful",
    userdata: user
  });
});


router.get("/loginwithgoogle",loginwithgoogle,(req,res)=>{
    const userdata=req.newdata;
    if(userdata){
        return res.status(201).json({message:"Login successful",data:userdata.url});
    }

});