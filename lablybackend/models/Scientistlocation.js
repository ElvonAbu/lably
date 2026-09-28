import mongoose from "mongoose";

const locationschema=new mongoose.Schema({
    ScientistName:{
        type:String,
        required:true
    },
    ScientistLocation:{
        latitude:{
        type:Number,
        required:true

    },
    longitude:{
        type:Number,
        required:true
    }
    }
    
});

export default mongoose.model(Scientistlocation,locationschema);