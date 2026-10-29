import LabTest from "../models/LaboratoryTest.js";


async function iftestexist(testname){
    const test=await LabTest.findOne({
        testname:testname
    });
    
    return test;

}


export default async function registertest(req,res,next){
        try{

            const{testname,technicalname}=req.body;
            if(!testname || !technicalname){
                return res.status(400).json({
                    message:"Bad Request please input test details"
                });
            }

            const testexist=await iftestexist(testname);
            if(testexist){
                return res.status(409).json({
                    message:"Test already exists",
                    data:testname
                });
            }

            const savetest= new LabTest({
                testname:testname,
                technicalname:technicalname
            });
            await savetest.save();

            req.testname=savetest.testname;
            return next();


        }
        catch(e){

                return res.status(500).json({
                    message:"Error coming from registering testbackend",
                    error:e.message
                });

        }      

}


export async function listtest(req,res,next){

            try{
                const tests=await LabTest.find();
                if(!tests){
                    return res.status(404).json({
                            message:"No tests found"
                    });
                } 
                req.testsfound=tests;
                return next();
            }
            catch(e){

                return res.status(500).json({
                    message:"Error coming from listbackend middleware",
                    error:e.message
                });
            }

}