import "./ScientistSection.css";

import ScientistImage from "../../assets/svg/scientist.svg";

import { Link } from "react-router-dom";

function ScientistSection(){

return(

<section className="scientist-section">

<div className="container scientist-layout">

<div className="scientist-content">

<h2>
Are You a Medical Laboratory
 Scientist?

</h2>

<p>

Partner with us to
bring quality laboratory
services closer to patients and 
expand your practice with 
our platform.
</p>

<Link to="/signup" className="btn-primary">
 Partner With Us
</Link>

</div>

<div className="scientist-image">

<img
src={ScientistImage}
alt="Scientist"
/>

</div>

</div>

</section>

)

}

export default ScientistSection;