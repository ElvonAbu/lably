import "./BenefitsSection.css";
import { Icon } from "@iconify/react";

const patientBenefits=[

{
icon:"mdi:clock-fast",
title:"Save Time",
text:"Book appointments without waiting in long hospital queues."
},

{
icon:"mdi:home-heart",
title:"At Home",
text:"Receive professional laboratory services from home."
},

{
icon:"mdi:shield-check",
title:"Safe & Secure",
text:"Your personal health information stays protected."
},

{
icon:"mdi:calendar-check",
title:"Flexible Scheduling",
text:"Choose appointment times that fit your routine."
}

];



const scientistBenefits=[

{
icon:"mdi:microscope",
title:"More Opportunities",
text:"Connect with more patients in your area."
},

{
icon:"mdi:briefcase-account",
title:"Flexible Work",
text:"Accept bookings based on your availability."
},

{
icon:"mdi:cash-fast",
title:"Reliable Earnings",
text:"Receive secure payments for completed appointments."
},

{
icon:"mdi:chart-line",
title:"Career Growth",
text:"Grow your professional profile with patient reviews."
}

];


function BenefitColumn({title,data}){

return(

<div className="benefit-column">

<h3>

{title}

</h3>

{

data.map((item)=>(

<div
className="benefit-card"
key={item.title}
>

<div className="benefit-icon">

<Icon
icon={item.icon}
width="40"
/>

</div>

<div>

<h4>

{item.title}

</h4>

<p>

{item.text}

</p>

</div>

</div>

))

}

</div>

)

}


function BenefitsSection(){

return(

<section className="benefits-section">

<div className="container">

<h2 className="section-title">

Key Benefits

</h2>

<div className="benefits-layout">

<BenefitColumn
title="For Patients"
data={patientBenefits}
/>

<BenefitColumn
title="For Laboratory Scientists"
data={scientistBenefits}
/>

</div>

</div>

</section>

)

}

export default BenefitsSection;