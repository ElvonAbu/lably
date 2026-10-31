import "./DoorToDoorSection.css";

import HouseCar from "../../assets/svg/houseandcar.svg";
import { Link } from "react-router-dom";


function DoorToDoorSection(){


return(

<section className="door-section">


<div className="container door-layout">


<div className="door-content">


<h2>

Door-to-door support

</h2>



<p>

Our healthcare professionals come directly
to your doorstep, making laboratory testing
simple, convenient and stress-free.

</p>



<Link to="/signup" className="btn-primary">
    Get Started
</Link>


</div>




<div className="door-image">


<img

src={HouseCar}

alt="Door to door healthcare support"

/>


</div>


</div>


</section>

)


}


export default DoorToDoorSection;