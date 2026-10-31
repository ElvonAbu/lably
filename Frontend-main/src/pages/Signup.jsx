import Navbar from "../components/Navbar/Navbar";
import AuthLayout from "../components/AuthLayout/AuthLayout";
import AuthHero from "../components/AuthHero/AuthHero";
import AuthCard from "../components/AuthCard/AuthCard";
import SignupForm from "../components/SignupForm/SignupForm";
import Features from "../components/AuthFeatures/AuthFeatures";
import Footer from "../components/Footer/Footer";

function Signup() {

    return (

        <>
            <Navbar hideGetStarted />
            <AuthLayout

                illustration={<AuthHero />}

            >

                <AuthCard

                    title="Let's Get Started"

                >

                    <SignupForm/>

                </AuthCard>

            </AuthLayout>

            <Features />

            <Footer />

        </>

    );

}

export default Signup;