import "./FeaturesSection.css";

import {
    BadgeCheck,
    Accessibility,
    House
} from "lucide-react";


const features = [

    {
        title:"Accurate Results",

        description:
        "Get reliable laboratory results through professional sample collection and trusted healthcare services.",

        icon:BadgeCheck
    },


    {
        title:"Accessible",

        description:
        "Healthcare made easier by connecting you with professionals wherever you are.",

        icon:Accessibility
    },


    {
        title:"At Home",

        description:
        "No more long queues. Our professionals come directly to your doorstep.",

        icon:House
    }

];



function FeaturesSection(){


return(

<section className="features-section">


<div className="container">


<div className="features-grid">


{
features.map((feature)=>{


const Icon = feature.icon;


return(

<div 
className="feature-card"
key={feature.title}
>


<div className="feature-icon">


<Icon 
size={42}
/>


</div>



<h3>

{feature.title}

</h3>



<p>

{feature.description}

</p>



</div>


)


})

}


</div>


</div>


</section>

)


}


export default FeaturesSection;