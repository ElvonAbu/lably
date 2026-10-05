import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy, useState } from "react";
import ProtectedRoute from "./components/ProtectedRoute/ProtectedRoute";
import SplashScreen from "./components/SplashScreen/SplashScreen";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const Signup = lazy(() => import("./pages/Signup"));
const Login = lazy(() => import("./pages/Login"));
const Home = lazy(() => import("./pages/Home"));
const VerifyOtp = lazy(() => import("./components/VerifyOtp/VerifyOtp"));
const ForgotPassword = lazy(() => import("./components/ForgotPassword/ForgotPassword"));
const ResetPassword = lazy(() => import("./components/ResetPassword/ResetPassword"));
const PasswordUpdated = lazy(() => import("./components/PasswordUpdated/PasswordUpdated"));
const LocationSearch = lazy(() => import("./pages/LocationSearch"));

const SPLASH_SHOWN_KEY = "lably_splash_shown";

function App() {

  const [showSplash, setShowSplash] = useState(

    () => !sessionStorage.getItem(SPLASH_SHOWN_KEY)

  );

  const handleSplashFinish = () => {

    sessionStorage.setItem(SPLASH_SHOWN_KEY, "1");

    setShowSplash(false);

  };

  if (showSplash) {

    return <SplashScreen onFinish={handleSplashFinish} />;

  }

  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify" element={<VerifyOtp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/password-updated" element={<PasswordUpdated />} />

          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />

          <Route
            path="/location-search"
            element={
              <ProtectedRoute>
                <LocationSearch />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;