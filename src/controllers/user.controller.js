import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }
    } catch (error) {
        new ApiError(500, "Something went wrong while generating access and refresh token")
    }
}

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

const loginUser = asyncHandler(async (req, res) => {

    // get user details from frontend 
    const { email, username, password } = req.body
    
    
    // login with username or email
    
    if (!(email || username)) {
        throw new ApiError(400, "Email or username is required");
    } // if both are not provided

    // if (!email && !username) {
    //     throw new ApiError(400, "Email or username is required");
    // } // if both are not provided


    // validate the user if exists
    const user = await User.findOne({
            $or: [{email}, {username}]
        })

    if (!user) {
        throw new ApiError(400, "User not found")
    }
    

    // check password (give access if matched)
    const isPasswordValid = await user.isPasswordMatched(password)
    
    if (!isPasswordValid) {
        throw new ApiError(400, "Invalid password")
    }
    
    
    // generate a refresh token and access token give it to that user
    const { refreshToken, accessToken } = await generateAccessAndRefreshToken(user._id)

    
    // send access token and refresh token in cookies
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    ) // remove password and refresh token from response
    
    const options = {
        httpOnly: true,
        secure: true
    }


    // send response
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser,
                accessToken,
                refreshToken  
            },
            "User logged in successfully"
        )
    )


})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {   
            $set: {
                refreshToken: ""
            }
        },
        { new: true }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"))

})

export { registerUser, loginUser, logoutUser }