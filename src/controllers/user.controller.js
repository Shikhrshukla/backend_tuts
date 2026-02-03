import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const registerUser = asyncHandler(async (req, res) => {

    // get user details from frontend 
    const { fullName, email, username, password } = req.body

    console.log("Request Body: ", req.body)


    // validation - not empty
    if (
        [fullName, email, username, password].some((field) =>
            field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required");
    }


    // check if user already exists, username or email
    const existingUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    console.log("Existing User: ", existingUser)
    if (existingUser) {
        throw new ApiError(409, "User already exists");
    }


    // check for images and avatar, avatar is mandatory
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }
    console.log("Files: ", req.files)
    console.log("Avatar Local Path: ", avatarLocalPath)
    console.log("Cover Image Local Path: ", coverImageLocalPath)


    // upload to cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar upload failed")
    }

    console.log("Avatar: ", avatar)
    console.log("Cover Image: ", coverImage)

    // create user object - entry in db
    const user = await User.create({
        fullName,
        username: username.toLowerCase(),
        email,
        avatar,
        coverImage: coverImage || "",
        password
    })


    // remove password and refressh token field from the response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    console.log("Created User: ", createdUser)


    // check for user creation success
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering user")
    }


    // return response
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )
    console.log("Response: ", res)
})

export { registerUser }