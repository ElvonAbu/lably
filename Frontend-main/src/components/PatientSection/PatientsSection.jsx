import "./PatientsSection.css";

import PatientImage from "../../assets/svg/patient-van.svg";

function PatientSection(){

return(

<section className="patient-section">

<div className="container patient-layout">

<div className="patient-image">

<img
src={PatientImage}
alt="Patient"
/>

</div>

<div className="patient-content">

<h2>

Healthcare That Fits
Into Your Lifestyle

</h2>

<p>

Schedule laboratory tests from home,
track appointments,
and receive quality healthcare
without disrupting your day.

</p>

<button className="btn-primary">

Learn More

</button>

</div>

</div>

</section>

)

}

export default PatientSection;