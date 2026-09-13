import mongoose from "mongoose";

const userlogin= new mongoose.Schema({
    email:{
        type:String,
        required:true,
    },
    supabaseUserId:{
        type:String,
        required:true
    }
});


export default mongoose.model("Userlogin",userlogin);