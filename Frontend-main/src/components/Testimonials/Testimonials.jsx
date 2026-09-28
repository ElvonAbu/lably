import "./Testimonials.css";
import { Icon } from "@iconify/react";

const testimonials = [

{
name:"Sarah Johnson",
role:"Patient",
message:
"The entire booking process was incredibly smooth and convenient."
},

{
name:"Michael James",
role:"Patient",
message:
"LABLY saved me hours. I didn't have to leave my house to get tested."
},

{
name:"Grace Adams",
role:"Patient",
message:
"I've never experienced healthcare this convenient. Highly recommended."
},

{
name:"Daniel Peter",
role:"Laboratory Scientist",
message:
"Lably helps me connect with more patients while managing my schedule."
},

{
name:"Chinenye Okafor",
role:"Patient",
message:
"Everything from booking to payment was seamless."
}

];

function TestimonialCard({item}){

const initials=item.name
.split(" ")
.map(word=>word[0])
.join("");

return(

<div className="testimonial-card">

<div className="testimonial-stars">

{

Array.from({length:5}).map((_,index)=>(

<Icon
key={index}
icon="mdi:star"
width="18"
/>

))

}

</div>


<div className="testimonial-profile">

<div className="testimonial-avatar">

{initials}

</div>

<div>

<h3>

{item.name}

</h3>

<span>

{item.role}

</span>

</div>

</div>

<p>

"{item.message}"

</p>

</div>

)

}

function Testimonials(){

return(

<section className="testimonials-section">

<div className="container">

<h2 className="section-title">

What People Are Saying

</h2>

<p className="section-description">

Trusted by patients and laboratory professionals.

</p>

<div className="testimonial-slider">

<div className="testimonial-track">

{

[...testimonials,...testimonials].map((item,index)=>(

<TestimonialCard

key={index}

item={item}

/>

))

}

</div>

</div>

</div>

</section>

)

}

export default Testimonials;