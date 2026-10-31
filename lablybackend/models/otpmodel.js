import mongoose from "mongoose";

const otp= new mongoose.Schema({
    email:{
        type:String,
        required:true,
    },
    otpHash:{
        type:String,
        required:true
    },
    expiresAt:{
        type:Date,
        required:true,
        index:true
    }
});


export default mongoose.model("Otpmodel",otp);