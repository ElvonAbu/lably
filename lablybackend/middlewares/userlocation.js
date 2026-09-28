import userlocation from "../models/userlocation.js";

async function updateuser(email, latitude, longitude) {
  await userlocation.findOneAndUpdate(
    { email },
    {
      $set: {
        latitude,
        longitude,
      },
    },
    { new: true }
  );
}

export default async function UsercLocation(req, res, next) {
  const email = req.email;
  const { latitude, longitude } = req.body;

  try {
    if (
      email == null ||
      latitude === undefined ||
      latitude === null ||
      longitude === undefined ||
      longitude === null ||
      Number.isNaN(Number(latitude)) ||
      Number.isNaN(Number(longitude))
    ) {
      return res.status(400).json({
        message: "latitude and longitude required",
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    const locationExist = await userlocation.findOne({ email });

    if (locationExist) {
      await updateuser(email, lat, lng);
    } else {
      const user_location = new userlocation({
        email,
        latitude: lat,
        longitude: lng,
      });

      await user_location.save();
    }

    next();
  } catch (e) {
    return res.status(500).json({
      message: "Error coming from userlocation backend",
      error: e.message,
    });
  }
}