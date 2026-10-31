import mongoose from "mongoose";


const EmergencyContact= new mongoose.Schema({
    ContactName:{
        type:String,
        required:true,
        minLength:3
    },
    relationship:{
        type:String,

    },
    Phonenumber:{
        type:Number,
        required:true,
        min:11,
        max:11
    }

});


export default mongoose.model("Emergency",EmergencyContact);