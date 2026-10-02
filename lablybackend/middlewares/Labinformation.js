import LabInfo from "../models/laboratoryinformation.js";


export default async function labinfo(req,res,next){
   try{
         const{LaboratoryName,LabAddress,Contact,OptionalEmail}=req.body;
    if(!LaboratoryName||!LabAddress||!Contact||!OptionalEmail){
        return res.status(400).json({
            message:"Those fields are required"
        });
    }
    const labexist=await LabInfo.findOne({Contact});
    if(labexist){
        return res.status(409).json({
            message:"Lab with Contact already exists",
            data:labexist.OptionalEmail
        });
    }
    const newlab= new LabInfo({
        LaboratoryName:LaboratoryName.trim().lowercase(),
        LabAddress:LabAddress.trim().lowercase(),
        Contact:Contact.trim().lowercase(),
        OptionalEmail:OptionalEmail.trim().lowercase()
    });
    await newlab.save();
    req.newlab=newlab;
    next();
   }
   catch(err){
    return res.status(500).json({
        message:"Error coming from registering the new lab.. internal server error",
        error:err.message
    });
   }
}