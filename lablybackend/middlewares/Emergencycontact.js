import Emergency from "../models/emergencycontact.js";


export default async function registercontact(req,res,next){
   try{
     const {ContactName,relationship,Phonenumber}=req.body;
    if(!ContactName||!relationship||!Phonenumber){
        return res.status(400).json({
            message:"Those fields are required"
        });
    }
     const userexist=await Emergency.findOne({Phonenumber});
     if(userexist){
        return res.status(409).json({
            message:"Conflic with the phonenumber this contact already exists"
        });
     }
     const newcontact= new Emergency({
            ContactName:ContactName.trim().lowercase(),
            relationship:relationship.trim().lowercase(),
            Phonenumber:Phonenumber.trim().lowercase()
     });
     await newcontact.save();
     req.contact=newcontact.ContactName;
     next();
   }
   catch(err){
    return res.status(500).json({
        message:"Error coming from registering new emergency contact",
        error:err.message
    });
   }
};