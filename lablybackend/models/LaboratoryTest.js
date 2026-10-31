import mongoose from "mongoose";

const Labtest=new mongoose.Schema({
        testname:{
            type:String,
            required:true,
            minLenght:5,
            trim:true
        },
        technicalname:{
            type:String,
            required:true,
            trim:true
        }
    
});


export default mongoose.model("LabTest",Labtest);