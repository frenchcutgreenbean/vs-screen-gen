from vstools import vs, core
from awsmfunc import FrameInfo, ScreenGen
from awsmfunc.types.placebo import (
    PlaceboTonemapOpts,
    PlaceboGamutMapping as Gamut,
    PlaceboTonemapFunction as Tonemap,
    PlaceboColorSpace as ColorSpace,
)


def set_common_props(clip, source, crop=False, tonemap=False, info=True):
    """
    Set common properties
    :param clip: Clip to set properties on
    :param source: Name of the source
    :param crop: Int of how much to crop off the top and bottom.
    """
    if tonemap:
        ## Placebo parameters
        args = PlaceboTonemapOpts(
            source_colorspace=ColorSpace.HDR10,
            target_colorspace=ColorSpace.SDR,
            tone_map_function=Tonemap.Spline,
            gamut_mapping=Gamut.Perceptual,
            use_dovi=False,
            contrast_recovery=0.3,
        )
        ## Tonemapping: Converts the dynamic range of the source [16-bit required]
        ## Specify the arguments based on your sources; play with different values when comparing against an SDR source to best match it
        clip = clip.resize.Lanczos(format=vs.YUV444P16)

        ## Apply tonemapping
        clip = clip.placebo.Tonemap(**args.vsplacebo_dict())

        # Retag video to 709 after tonemapping
        clip = clip.std.SetFrameProps(
            _Matrix=vs.MATRIX_BT709,
            _Transfer=vs.TRANSFER_BT709,
            _Primaries=vs.PRIMARIES_BT709,
        )
    # Crop the clip to remove black bars
    if crop:
        # Make sure crop is divisible by 2 or else errors
        # For some reason if the clip is tonemapped it's fine.
        if not tonemap and crop & 1:
            crop -= 1
        clip = clip.std.Crop(left=0, right=0, top=crop, bottom=crop)

    # Set frame info
    if info:
        clip = FrameInfo(
            clip,
            ## These settings make the font a yellow with black border and a little bit bigger kinda like avs subs
            style="sans-serif,35,&H0000FFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,7,10,10,10,1",
            title=source,
        )
    return clip


def get_frame_info(clip: vs.VideoNode, frame: int) -> bool:
    """
    Checks if the frame is a B frame.
    :param clip: The video clip to check.
    :param frame: The frame number to check.
    :return: A bool indicating whether the frame is of type B.
    """
    f = clip.get_frame(frame)

    if "_PictType" in f.props:
        pict_type = f.props["_PictType"]
        if not isinstance(pict_type, str):
            pict_type = str(pict_type, "utf-8")
        return pict_type == "B"
    return False


def get_frames(clips: list, starting_frame=4000, screen_count=20, stop_before=8000):
    """
    Returns a list of frames between starting_frame and stop_before.
    :param clips: List of video clips to check.
    :param starting_frame: Int of the frame to start from (to skip intros).
    :param screen_count: Int of how many screenshots you would like.
    :param stop_before: Int of how many frames to stop before (to skip credits).
    :return: List of frames.
    """
    total_frames = clips[0].num_frames
    start_frame = starting_frame
    end_frame = total_frames - stop_before
    frame_step = (end_frame - start_frame) // screen_count

    frames = []
    print("Getting B frames...")
    for i in range(screen_count):
        test_frame = start_frame + i * frame_step
        is_b_frame = all(get_frame_info(clip, test_frame) for clip in clips)
        while test_frame < end_frame and is_b_frame == False:
            test_frame += 1
            is_b_frame = all(get_frame_info(clip, test_frame) for clip in clips)
        if is_b_frame:
            frames.append(test_frame)

    return frames


## File paths: Hold shift and right-click your file in the Windows File Explorer, select copy as path, and paste it here
paths = [
    r"C:\path-to\clip1",
    r"C:\path-to\clip2",
]

## Sources of the clips: This will be the screenshot name and in the frame info.
sources = [
    "Clip 1 Info",
    "Clip 2 Info",
]

## Load clips
clips = [
    core.lsmas.LWLibavSource(source=paths[0]),
    core.lsmas.LWLibavSource(source=paths[1]),
    # core.lsmas.LWLibavSource(source=paths[2]),
    # core.lsmas.LWLibavSource(source=paths[3])
]

## Apply settings to clips
## Params: clip, source, crop: int size in pixels of black bars / 2, tonemap: bool, info: bool to include the FrameInfo in screens.
clips[0] = set_common_props(
    clip=clips[0], source=sources[0], crop=0, tonemap=True, info=False
)
clips[1] = set_common_props(clip=clips[1], source=sources[1], crop=False, tonemap=True)
# clips[2] = set_common_props(clip = clips[2], source=sources[2], crop=False, tonemap=True)

## Trim clips to sync: in frames
# clips[0] = clips[0][238:]

## Get B frames to comp
## Params: clips: list, start frame: int frame after intros, screenshot count, stop before: int frame before credits
frames = get_frames(clips, 4000, 15, 4000)


ScreenGen(clips, "Screenshots", frame_numbers=frames, suffix=sources)
