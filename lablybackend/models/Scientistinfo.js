import mongoose from "mongoose";

const scientist_info=new mongoose.Schema({
   Firstname:{
    type:String,
    required:true
   },
   Gender:{
    type:String,
    enum:["male","female"]
   },
   Lastname:{
    type:String,
    required:true
   },
   DateofBirth:{
        type:String,
        required:true,
   },
   Phonenumber:{
    type:String,
    required:true,
    min:[11," Phonenumber must be at least 11 digits"],
    max:[11," Phonenumber must be at most 11 digits"]
   },
   Email:{
    type:String,
    required:true,
    minlength:[5,"Email is too short"]
   },
   Createdat:{
      type:Date,
   }
   
});

export default mongoose.model("Scientist",scientist_info);