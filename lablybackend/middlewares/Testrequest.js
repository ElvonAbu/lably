import TestRequest from "../models/TestRequest.js";
import Users from "../models/signup.js";
import LabTest from "../models/LaboratoryTest.js";
import {GoogleSignup} from "../models/signup.js";


async function verifytest(Test_id,Patient_id){
    try{
        const exist=await TestRequest.find({
        patientid:Patient_id,
            });
            if(exist){
                const test_status=exist.status;
                if(test_status==="Approved"){
                    return true;
                }
                else if(test_status==="Pending"){
                    return 
                }
            }

    }
    catch(e){
            console.log(`Error coming from test verify backend ${e.message}`);
            return ;
    }
   

}

async function getidfromtest(testname){
    try{
        const exist=await LabTest.findOne({Testname:testname});
        if(exist){
            const id=exist._id;
            return id;
        }
    }
    catch(e){
        console.log(" This is the Error",e.message);
    }
}

export async function newRequestMiddleware(req, res, next) {
    const { userid } = req.user;
    const { testname, patientname, patientnumber } = req.body;

    try {
        // Validate request body
        if (!testname || !patientname || !patientnumber) {
            return res.status(400).json({
                message: "Please provide all required details."
            });
        }

        // Get the test ID
        const test_id = await getidfromtest(testname);

        if (!test_id) {
            return res.status(404).json({
                message: "Test not found."
            });
        }

        // Check if this patient already requested this test
        const existingRequest = await TestRequest.findOne({
            patientid: userid,
            test_id: test_id
        });

        if (existingRequest) {
            if (existingRequest.status === "Pending") {
                return res.status(400).json({
                    message: "You have already requested this test. Please wait for approval."
                });
            }

            if (existingRequest.status === "Approved") {
                return res.status(400).json({
                    message: "This test has already been approved."
                });
            }
        }
        else if(!existingRequest){
             const newTest = new TestRequest({
            patientid: userid,
            testname,
            test_id,
            status: "Pending",
            patientname,
            patientnumber

        });

        await newTest.save();
        }
        req.test_id = test_id;

        next();

    } catch (e) {
        return res.status(500).json({
            message: "Error validating test request",
            error: e.message
        });
    }
}


async function getuserbyid(userid){
        try{
            const exist=await Users.findById(userid);
            if(exist){
                return exist;
            }
        }
        catch(e){
            console.log(`This is the error ${e.message}`);
        }
}