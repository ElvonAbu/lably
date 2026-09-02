import mongoose from "mongoose";


const identity=new mongoose.Schema({
    Documenturl:{
        type:String,
        required:true
    },
    phonenumber:{
        type:Number,
        required:true
    },
    Documenttype:{
        type:String,  
    },
    Scientistid:[{type:mongoose.Schema.Types.ObjectId,ref:"Scientist"}]


});

export default mongoose.model("Identity",identity);