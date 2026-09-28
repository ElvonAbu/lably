import mongoose from "mongoose";


const otpschema= new mongoose.Schema({
    type:Number,
    required:true,
    max:11
});

export default mongoose.model("otpschema",otpschema);