import multer from "multer";

const storage=multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null,"uploads/");
    },
    filename:(req,file,cb)=>{
        const name=file.originalname;
        cb(null,name);
    }
});

const upload=multer({storage:storage});
