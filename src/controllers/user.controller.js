import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating access and refresh token")
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


    // remove password and refresh token field from the response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    console.log("Created User: ", createdUser)


    // check for user creation success
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering user")
    }

    return res
    .status(201)
    .json(
        new ApiResponse(201, createdUser, "User registered successfully")
    )
})

const loginUser = asyncHandler(async (req, res) => {

    // get user details from frontend 
    const { email, username, password } = req.body


    // login with username or email

    // if (!(email || username)) {
    //     throw new ApiError(400, "Email or username is required");
    // } // if both are not provided

    if (!email && !username) {
        throw new ApiError(400, "Email or username is required");
    } // if both are not provided


    // validate the user if exists
    const user = await User.findOne({
        $or: [{ email }, { username }]
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
    try {
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
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})

const refreshAccessToken = asyncHandler(async (req, res) => {
    try {
        const incomingRefreshToken = req.cookies?.refreshToken || req.body.refreshToken;

        if (!incomingRefreshToken) {
            throw new ApiError(401, "Unauthorized request")
        }

        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)

        const user = await User.findById(decodedToken?._id)
        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }

        if (user.refreshToken !== incomingRefreshToken) {
            throw new ApiError(401, "Invalid refresh token")
        }

        const options = {
            httpOnly: true,
            secure: true
        }

        const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id)

        return res
            .status(200)
            .cookie("refreshToken", refreshToken, options)
            .cookie("accessToken", accessToken, options)
            .json(
                new ApiResponse(200, { accessToken, refreshToken }, "Refresh token generated successfully")
            )

    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword, confirmPassword } = req.body

    if (newPassword !== confirmPassword) {
        throw new ApiError(400, "New password and confirm password do not match")
    }

    const user = await User.findById(req.user?._id)

    if (!user) {
        throw new ApiError(401, "User not found")
    }

    const isPasswordValid = await user.isPasswordMatched(oldPassword)

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid password")
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(
            new ApiResponse(200, {}, "Password changed successfully")
        )
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(
            new ApiResponse(200, req.user, "User fetched successfully")
        )
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body

    if (!fullName || !email) {
        throw new ApiError(400, "Full name and email are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email
            }
        },
        { new: true }
    ).select("-password")

    if (!user) {
        throw new ApiError(401, "User not Found")
    }

    // No Need of this code beacuse we are using findByIdAndUpdate
    /*   user.fullName = fullName;
       user.email = email;
       await user.save();
    */

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "User updated successfully")
        )
})

const updateAvatar = asyncHandler(async (req, res) => {
    try {
        const avatarLocalPath = req.file?.path

        if (!avatarLocalPath) {
            throw new ApiError(401, "Avatar is required")
        }

        const avatar = await uploadOnCloudinary(avatarLocalPath)  // upload on cloudinary and return url

        if (!avatar) {
            throw new ApiError(401, "Error while uploading avatar")
        }

        const user = await User.findByIdAndUpdate(
            req.user?._id,
            {
                $set: {
                    avatar: avatar
                }
            },
            { new: true }
        ).select(
            "-password"
        )

        return res
            .status(200)
            .json(
                new ApiResponse(200, user, "Avatar updated successfully")
            )
    } catch (error) {
        throw new ApiError(401, error?.message || "Error while uploading avatar")
    }
})

const updateCoverImage = asyncHandler(async (req, res) => {
    try {
        const coverImageLocalPath = req.file?.path

        if (!coverImageLocalPath) {
            throw new ApiError(401, "Cover image is required")
        }

        const coverImage = await uploadOnCloudinary(coverImageLocalPath)  // upload on cloudinary and return url

        if (!coverImage) {
            throw new ApiError(401, "Error while uploading cover image")
        }

        const user = await User.findByIdAndUpdate(
            req.user?._id,
            {
                $set: {
                    coverImage: coverImage
                }
            },
            { new: true }
        ).select(
            "-password"
        )

        return res
            .status(200)
            .json(
                new ApiResponse(200, user, "Cover image updated successfully")
            )
    } catch (error) {
        throw new ApiError(401, error?.message || "Error while uploading cover image")
    }
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    getCurrentUser,
    changeCurrentPassword,
    updateAccountDetails,
    updateAvatar,
    updateCoverImage
}