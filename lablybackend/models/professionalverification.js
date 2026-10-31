import mongoose from "mongoose";

const Proverification=new mongoose.Schema({
    LicenseNumber:{
        type:Number,
        required:true
    },
    Ownerid:[{type:mongoose.Schema.Types.ObjectId,ref:"Scientist",required:true}],
    UploadedLicenseDocumenturl:{
        type:String,
        required:true
    },
    DocumenType:{
        type:String,
        required:true,    
    }

});


export default mongoose.model("LicenseVerification",Proverification);
