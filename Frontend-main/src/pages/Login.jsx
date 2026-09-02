import Navbar from "../components/Navbar/Navbar";
import AuthLayout from "../components/AuthLayout/AuthLayout";
import AuthHero from "../components/AuthHero/AuthHero";
import AuthCard from "../components/AuthCard/AuthCard";
import LoginForm from "../components/LoginForm/LoginForm";
import Features from "../components/AuthFeatures/AuthFeatures";
import Footer from "../components/Footer/Footer";

function Login() {

    return (

        <>
           <Navbar hideGetStarted />
            <AuthLayout

                illustration={<AuthHero />}

            >

                <AuthCard

                    title="Welcome Back"

                    subtitle="Sign in to continue using LABLY."

                >

                    <LoginForm/>

                </AuthCard>

            </AuthLayout>

            <Features />

            <Footer />

        </>

    );

}

export default Login;