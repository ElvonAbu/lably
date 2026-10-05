import express from "express";
import multer from "multer";

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            cb(null, "uploadeddocuments/");
        } catch (err) {
            cb(err);
        }
    },

    filename: (req, file, cb) => {
        try {
            const documentname = Date.now() + "-" + file.originalname;
            cb(null, documentname);
        } catch (err) {
            cb(err);
        }
    }
});

const upload = multer({ storage });

router.post("/", upload.single("picture"), (req, res) => {
    try {

        console.log("This is the document:", req.file);

        return res.status(200).json({
            message: "Upload successful",
            data: req.file
        });

    } catch (err) {

        return res.status(500).json({
            message: "Backend error",
            error: err.message
        });
    }
});

router.get("/verifytesting", (req, res) => {

    console.log("Verifying testing");

    res.json({
        message: "You're in the verifytesting route"
    });
});

router.post(
    "/licenseverification",
    upload.array("license", 2),
    (req, res) => {

        try {

            console.log("These are the documents:", req.files);

            res.status(200).json({
                message: "Upload Successful",
                data: req.files
            });

        } catch (err) {

            res.status(500).json({
                message: "Backend error",
                error: err.message
            });
        }
    }
);

export default router;