import { testBackendConnection } from "./testApi";

testBackendConnection()
    .then((data) => {

        console.log(
            "✅ LABLY FRONTEND → BACKEND:",
            data
        );

    })
    .catch((error) => {

        console.error(
            "❌ LABLY FRONTEND → BACKEND FAILED:",
            error
        );

    });