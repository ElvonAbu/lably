import express from "express";
import verifySupabaseAuth from "../middlewares/verifySupabaseAuth.js";
import {newRequestMiddleware} from "../middlewares/Testrequest.js";
const router=express.Router();


router.post("/",verifySupabaseAuth,newRequestMiddleware,(req,res)=>{

     return res.status(201).json({
        message: "Test request processed",
        created: req.testRequests,  
        alreadyRequested: req.existingTests   
    });


});


router.patch("/:id/cancel", verifySupabaseAuth, async (req, res) => {
  const userid = req.user.id;
  const { id } = req.params;
 
  try {
    const request = await TestRequest.findById(id);
 
    if (!request) {
      return res.status(404).json({
        message: "Test request not found."
      });
    }
 
    if (request.patientid !== userid) {
      return res.status(403).json({
        message: "You are not allowed to cancel this request."
      });
    }
 
    if (request.Status === "Canceled") {
      return res.status(409).json({
        message: "This request is already canceled."
      });
    }
 
    if (request.Status === "Approved") {
      return res.status(409).json({
        message: "Approved requests can't be canceled here. Contact support."
      });
    }
 
    request.Status = "Canceled";
    await request.save();
 
    return res.status(200).json({
      message: "Test request canceled.",
      testRequest: request
    });
 
  } catch (e) {
    return res.status(500).json({
      message: "Error canceling test request",
      error: e.message
    });
  }
});