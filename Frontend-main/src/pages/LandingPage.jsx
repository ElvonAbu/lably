import "./LandingPage.css";

import Navbar from "../components/Navbar/Navbar";
import Hero from "../components/Hero/Hero";
import IntroBanner from "../components/IntroBanner/IntroBanner";
import TrustSection from "../components/TrustSection/TrustSection";
import FeaturesSection from "../components/FeaturesSection/FeaturesSection";
import PatientSection from "../components/PatientSection/PatientsSection";
import ScientistSection from "../components/ScientistSection/ScientistSection";
import DoorToDoorSection from "../components/DoorToDoorSection/DoorToDoorSection";
import BenefitsSection from "../components/BenefitsSection/BenefitsSection";
import Testimonials from "../components/Testimonials/Testimonials";
import WhyChooseUs from "../components/WhyChooseUs/WhyChooseUs";
import ContactSection from "../components/Contactsection/ContactSection";
import Footer from "../components/Footer/Footer";

function LandingPage() {
  return (
<div className="landing-page">

    <Navbar />

    <Hero />

    <IntroBanner />

    <TrustSection />

    <FeaturesSection />

    <PatientSection />

    <ScientistSection />

    <DoorToDoorSection />

    <BenefitsSection />

    <Testimonials />

    <WhyChooseUs />

    <ContactSection />

    <Footer />
</div>
    
  );
}

export default LandingPage;
