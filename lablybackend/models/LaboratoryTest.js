import mongoose from "mongoose";

const Labtest=new mongoose.Schema({
        Testname:{
            type:String,
            required:true,
            minLenght:5,
        },
        RecommendedLabfee:{
            type:Number,
            required:true,
        },
        ScientistFee:{
            type:Number,
            required:true
        },
        AppCommision:{
            type:Number,
            required:true
        },
        TotalPrice:{
            type:Number,
            required:true
        }
    
});


export default mongoose.model("LabTest",Labtest);