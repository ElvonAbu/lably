import "./BottomSheet.css";
import { Search } from "lucide-react";

function BottomSheet({ onClick, loading = false }) {

    return (

        <div className="map-bottom-sheet">

            <button
                className="btn-primary map-location-btn"
                onClick={onClick}
                disabled={loading}
                type="button"
            >

                <Search size={22} />

                <span>

                    {
                        loading
                            ? "Getting location..."
                            : "Where Are You?"
                    }

                </span>

            </button>

        </div>

    );

}

export default BottomSheet;