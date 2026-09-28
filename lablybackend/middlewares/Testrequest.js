import TestRequest from "../models/TestRequest.js";
import Users from "../models/signup.js";
import LabTest from "../models/LaboratoryTest.js"; // confirm this matches the actual filename on disk


async function verifytest(Test_id, Patient_id) {
    try {
        const exist = await TestRequest.findOne({
            patientid: Patient_id,
            Testid: Test_id
        });

        if (exist) {
            if (exist.Status === "Approved") {
                return true;
            }
            else if (exist.Status === "Pending") {
                return false;
            }
        }

        return false;

    }
    catch (e) {
        console.log(`Error coming from test verify backend ${e.message}`);
        return false;
    }


}

async function getidfromtest(testname) {
    try {
        const exist = await LabTest.findOne({ Testname: testname });
        if (exist) {
            const id = exist._id;
            return id;
        }
    }
    catch (e) {
        console.log(" This is the Error", e.message);
    }
}

export async function newRequestMiddleware(req, res, next) {
    const { userid } = req.user.id;
    const { testname, patientname, patientnumber } = req.body;

    try {
        
        if (
            !testname ||
            !Array.isArray(testname) ||
            testname.length === 0 ||
            !patientname ||
            !patientnumber
        ) {
            return res.status(400).json({
                message: "Please provide all required details."
            });
        }

        const createdTests = [];
        const existingTests = [];

        
        for (const name of testname) {

            
            const test_id = await getidfromtest(name);

            if (!test_id) {
                return res.status(404).json({
                    message: `Test "${name}" not found.`
                });
            }

           
            const existingRequest = await TestRequest.findOne({
                patientid: userid,
                Testid: test_id
            });

            if (existingRequest) {

                if (existingRequest.Status === "Pending") {
                    existingTests.push({
                        testname: name,
                        message: "Already requested and waiting for approval."
                    });

                    continue;
                }

                if (existingRequest.Status === "Approved") {
                    existingTests.push({
                        testname: name,
                        message: "Already approved."
                    });

                    continue;
                }
            }

            const newTest = new TestRequest({
                patientid: userid,
                Testname: name,
                Testid: test_id,
                Status: "Pending",
                Patient: {
                    name: patientname,
                    number: patientnumber
                }
            });

            await newTest.save();

            createdTests.push({
                testname: name,
                test_id
            });
        }

        req.test_id = createdTests.map(test => test.test_id);

        req.testRequests = createdTests;
        req.existingTests = existingTests;

        return next();

    } catch (e) {
        return res.status(500).json({
            message: "Error validating test request",
            error: e.message
        });
    }
}


async function getuserbyid(userid) {
    try {
        const exist = await Users.findById(userid);
        if (exist) {
            return exist;
        }
    }
    catch (e) {
        console.log(`This is the error ${e.message}`);
    }
}